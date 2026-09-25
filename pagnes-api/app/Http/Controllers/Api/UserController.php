<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Exceptions\RegleMetierException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/** Gestion des comptes vendeur/administrateur — réservé à l'administrateur. */
class UserController extends Controller
{
    /** Messages affichés tels quels par le frontend : en français, avec le vocabulaire de l'interface. */
    private const MESSAGES = [
        'nom.required' => 'Le nom est obligatoire.',
        'email.required' => "L'identifiant est obligatoire.",
        'email.unique' => 'Cet identifiant est déjà utilisé.',
        'mot_de_passe.required' => 'Le mot de passe est obligatoire.',
        'mot_de_passe.min' => 'Le mot de passe doit contenir au moins 6 caractères.',
    ];

    public function index()
    {
        return User::orderBy('nom')->get(['id', 'nom', 'email', 'role', 'actif']);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nom' => 'required|string|max:150',
            'email' => 'required|string|max:150|unique:users,email',
            'mot_de_passe' => 'required|string|min:6',
            'role' => 'required|in:admin,vendeur',
            'actif' => 'required|boolean',
        ], self::MESSAGES);
        $user = User::create([
            'nom' => $data['nom'], 'email' => $data['email'], 'password' => Hash::make($data['mot_de_passe']),
            'role' => $data['role'], 'actif' => $data['actif'],
        ]);
        return response()->json($user, 201);
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            'nom' => 'required|string|max:150',
            'email' => 'required|string|max:150|unique:users,email,' . $user->id,
            'mot_de_passe' => 'nullable|string|min:6',
            'role' => 'required|in:admin,vendeur',
            'actif' => 'required|boolean',
        ], self::MESSAGES);

        $resteAdminActif = $data['role'] === 'admin' && $data['actif'];
        if ($user->role === 'admin' && !$resteAdminActif
            && User::where('role', 'admin')->where('actif', true)->where('id', '!=', $user->id)->doesntExist()) {
            return response()->json(['message' => 'Il doit toujours rester un administrateur actif.'], 422);
        }

        $user->update(array_filter([
            'nom' => $data['nom'], 'email' => $data['email'], 'role' => $data['role'], 'actif' => $data['actif'],
            'password' => !empty($data['mot_de_passe']) ? Hash::make($data['mot_de_passe']) : null,
        ], fn ($v) => $v !== null));

        // Compte désactivé, rôle changé ou mot de passe modifié : les sessions en cours sont coupées.
        if (!$data['actif'] || !empty($data['mot_de_passe']) || $user->wasChanged('role')) {
            $user->tokens()->delete();
        }

        return response()->json($user);
    }
}

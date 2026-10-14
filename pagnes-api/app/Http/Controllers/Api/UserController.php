<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/** Gestion des comptes vendeur/administrateur — réservé à l'administrateur. */
class UserController extends Controller
{
    /** Messages affichés tels quels par le frontend, avec le vocabulaire de l'interface, dans la langue de la requête. */
    private static function messages(): array
    {
        return [
            'nom.required' => __('Le nom est obligatoire.'),
            'email.required' => __('L’identifiant est obligatoire.'),
            'email.unique' => __('Cet identifiant est déjà utilisé.'),
            'mot_de_passe.required' => __('Le mot de passe est obligatoire.'),
            'mot_de_passe.min' => __('Le mot de passe doit contenir au moins 6 caractères.'),
        ];
    }

    public function index(Request $request)
    {
        return $this->usersFor($request->user())->orderBy('nom')->get(['id', 'nom', 'email', 'role', 'actif']);
    }

    public function store(Request $request)
    {
        $actor = $request->user();
        $this->assertBoutiqueAdminContext($actor);

        $data = $request->validate([
            'nom' => 'required|string|max:150',
            'email' => 'required|string|max:150|unique:users,email',
            'mot_de_passe' => 'required|string|min:6',
            'role' => 'required|in:admin,boutique_admin,vendeur',
            'actif' => 'required|boolean',
        ], self::messages());

        $role = $data['role'] === 'admin' ? 'boutique_admin' : $data['role'];

        $user = User::create([
            'nom' => $data['nom'], 'email' => $data['email'], 'password' => Hash::make($data['mot_de_passe']),
            'role' => $role, 'actif' => $data['actif'],
            'tenant_id' => $actor->tenant_id, 'boutique_id' => $actor->boutique_id,
        ]);

        return response()->json($user, 201);
    }

    public function update(Request $request, int $user)
    {
        $actor = $request->user();
        $this->assertBoutiqueAdminContext($actor);
        $user = $this->usersFor($actor)->findOrFail($user);

        $data = $request->validate([
            'nom' => 'required|string|max:150',
            'email' => 'required|string|max:150|unique:users,email,'.$user->id,
            'mot_de_passe' => 'nullable|string|min:6',
            'role' => 'required|in:admin,boutique_admin,vendeur',
            'actif' => 'required|boolean',
        ], self::messages());

        $role = $data['role'] === 'admin' ? 'boutique_admin' : $data['role'];

        $resteAdminActif = in_array($role, ['admin', 'boutique_admin'], true) && $data['actif'];
        $rolesAdmin = ['admin', 'boutique_admin'];
        if (in_array($user->role, $rolesAdmin, true) && ! $resteAdminActif
            && $this->usersFor($actor)->whereIn('role', $rolesAdmin)->where('actif', true)->where('id', '!=', $user->id)->doesntExist()) {
            return response()->json(['message' => __('Il doit toujours rester un administrateur actif.')], 422);
        }

        $user->update(array_filter([
            'nom' => $data['nom'], 'email' => $data['email'], 'role' => $role, 'actif' => $data['actif'],
            'password' => ! empty($data['mot_de_passe']) ? Hash::make($data['mot_de_passe']) : null,
        ], fn ($v) => $v !== null));

        // Compte désactivé, rôle changé ou mot de passe modifié : les sessions en cours sont coupées.
        if (! $data['actif'] || ! empty($data['mot_de_passe']) || $user->wasChanged('role')) {
            $user->tokens()->delete();
        }

        return response()->json($user);
    }

    private function assertBoutiqueAdminContext(User $user): void
    {
        abort_unless(! $user->is_super_admin && $user->tenant_id && $user->boutique_id && $user->estAdmin(), 403);
    }

    private function usersFor(User $user): Builder
    {
        $this->assertBoutiqueAdminContext($user);

        return User::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('boutique_id', $user->boutique_id);
    }
}

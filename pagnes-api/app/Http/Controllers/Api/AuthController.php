<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Connexion par identifiant (le champ `email` sert d'identifiant, comme en Phase 1). */
    public function login(Request $request)
    {
        $data = $request->validate(['identifiant' => 'required|string', 'mot_de_passe' => 'required|string']);

        $user = User::where('email', $data['identifiant'])->first();
        if (!$user || !$user->actif || !Hash::check($data['mot_de_passe'], $user->password)) {
            throw ValidationException::withMessages(['identifiant' => 'Identifiant ou mot de passe incorrect.']);
        }

        return response()->json([
            'user' => $user->only(['id', 'nom', 'role']),
            'token' => $user->createToken('caisse')->plainTextToken,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->noContent();
    }

    public function me(Request $request)
    {
        return $request->user()->only(['id', 'nom', 'role']);
    }
}

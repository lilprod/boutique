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
            'mot_de_passe.min' => __('Le mot de passe doit contenir au moins 8 caractères.'),
        ];
    }

    /** Rôles qui comptent comme administrateur de la boutique (le dernier actif ne peut pas être retiré). */
    private const ROLES_ADMIN = ['admin', 'tenant_admin', 'boutique_admin'];

    /** Rang hiérarchique : on ne gère que les comptes de rang inférieur ou égal au sien. */
    private static function rang(?string $role): int
    {
        return match ($role) {
            'admin', 'tenant_admin' => 3,
            'boutique_admin' => 2,
            default => 1,
        };
    }

    public function index(Request $request)
    {
        return $this->gerables($request->user())->orderBy('nom')->get(['id', 'nom', 'email', 'role', 'actif']);
    }

    public function store(Request $request)
    {
        $actor = $request->user();
        $this->assertBoutiqueAdminContext($actor);

        $data = $request->validate([
            'nom' => 'required|string|max:150',
            'email' => 'required|string|max:150|unique:users,email',
            'mot_de_passe' => 'required|string|min:8',
            'role' => 'required|in:admin,tenant_admin,boutique_admin,vendeur',
            'actif' => 'required|boolean',
        ], self::messages());

        $role = $this->roleAttribue($actor, $data['role'], null);
        if ($data['actif']) {
            $this->assertQuotaUtilisateurs($actor);
        }

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
        // Un compte de rang supérieur (le gérant pour un admin de boutique) est introuvable, comme un compte d'une autre boutique.
        $user = $this->gerables($actor)->findOrFail($user);

        $data = $request->validate([
            'nom' => 'required|string|max:150',
            'email' => 'required|string|max:150|unique:users,email,'.$user->id,
            'mot_de_passe' => 'nullable|string|min:8',
            'role' => 'required|in:admin,tenant_admin,boutique_admin,vendeur',
            'actif' => 'required|boolean',
        ], self::messages());

        $role = $this->roleAttribue($actor, $data['role'], $user);

        $resteAdminActif = in_array($role, self::ROLES_ADMIN, true) && $data['actif'];
        if (in_array($user->role, self::ROLES_ADMIN, true) && $user->actif && ! $resteAdminActif
            && $this->usersFor($actor)->whereIn('role', self::ROLES_ADMIN)->where('actif', true)->where('id', '!=', $user->id)->doesntExist()) {
            return response()->json(['message' => __('Il doit toujours rester un administrateur actif.')], 422);
        }
        if ($data['actif'] && ! $user->actif) {
            $this->assertQuotaUtilisateurs($actor); // réactiver un compte reprend une place de l'offre
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

    /**
     * Rôle réellement enregistré. « admin » (libellé de l'interface) garde le rôle administrateur
     * actuel du compte, sinon devient boutique_admin. Seul le gérant (tenant_admin) peut nommer un gérant.
     */
    private function roleAttribue(User $actor, string $demande, ?User $cible): string
    {
        if ($demande === 'admin') {
            return $cible && self::rang($cible->role) === 3 ? $cible->role : 'boutique_admin';
        }
        if (self::rang($demande) > self::rang($actor->role)) {
            abort(403, __('Vous ne pouvez pas attribuer un rôle supérieur au vôtre.'));
        }

        return $demande;
    }

    /** Nombre de comptes actifs limité par l'offre de l'entreprise. */
    private function assertQuotaUtilisateurs(User $actor): void
    {
        if (! $actor->tenant?->canAddUser()) {
            abort(422, __('Limite de comptes actifs atteinte pour votre offre. Désactivez un compte ou changez d\'offre.'));
        }
    }

    /** Comptes de la boutique que l'utilisateur a le droit de voir et de modifier. */
    private function gerables(User $actor): Builder
    {
        $roles = array_values(array_filter(['admin', 'tenant_admin', 'boutique_admin', 'vendeur'], fn ($r) => self::rang($r) <= self::rang($actor->role)));

        return $this->usersFor($actor)->where(fn (Builder $q) => $q->whereIn('role', $roles)->orWhere('id', $actor->id));
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

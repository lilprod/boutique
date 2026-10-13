<?php

namespace App\Services;

use App\Exceptions\RegleMetierException;
use App\Models\LigneVente;
use App\Models\Produit;
use App\Models\Proprietaire;
use App\Models\ProprietaireMotif;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ProprietaireService
{
    /** Propriétaire désigné par les règles « motif → propriétaire » de la boutique, s'il y en a un. */
    public function pourMotif(User $utilisateur, ?string $motif): ?int
    {
        $motif = trim((string) $motif);
        if ($motif === '') {
            return null;
        }

        return ProprietaireMotif::query()->forCurrentContext($utilisateur)->where('motif', $motif)->value('proprietaire_id');
    }

    /**
     * Crée ou modifie un propriétaire et ses motifs. Les produits de ces motifs lui sont
     * (ré)attribués ; ceux d'un motif retiré gardent leur propriétaire actuel.
     *
     * @param  array{nom: string, user_id?: ?int, actif?: bool, motifs?: string[]}  $donnees
     */
    public function enregistrer(?Proprietaire $existant, array $donnees, User $utilisateur): Proprietaire
    {
        $nom = trim($donnees['nom'] ?? '');
        if ($nom === '') {
            throw new RegleMetierException('Le nom du propriétaire est obligatoire.');
        }
        $motifs = collect($donnees['motifs'] ?? [])->map(fn ($m) => trim((string) $m))->filter()->unique(fn ($m) => mb_strtolower($m))->values();

        return DB::transaction(function () use ($existant, $donnees, $utilisateur, $nom, $motifs) {
            $contexte = ['tenant_id' => $utilisateur->tenant_id, 'boutique_id' => $utilisateur->boutique_id];
            $valeurs = ['nom' => $nom, 'user_id' => $donnees['user_id'] ?? null, 'actif' => $donnees['actif'] ?? true];
            $proprietaire = $existant ? tap($existant)->update($valeurs) : Proprietaire::create($contexte + $valeurs);

            $pris = ProprietaireMotif::query()->forCurrentContext($utilisateur)
                ->whereIn('motif', $motifs)->where('proprietaire_id', '!=', $proprietaire->id)
                ->with('proprietaire:id,nom')->first();
            if ($pris) {
                throw new RegleMetierException(sprintf('Le motif « %s » appartient déjà à %s.', $pris->motif, $pris->proprietaire->nom));
            }

            $proprietaire->motifs()->whereNotIn('motif', $motifs)->delete();
            foreach ($motifs as $motif) {
                $proprietaire->motifs()->firstOrCreate(['motif' => $motif], $contexte);
            }
            if ($motifs->isNotEmpty()) {
                Produit::query()->forCurrentContext($utilisateur)->whereIn('motif', $motifs)->update(['proprietaire_id' => $proprietaire->id]);
            }

            return $proprietaire->load('motifs')->loadCount('produits');
        });
    }

    public function supprimer(Proprietaire $proprietaire): void
    {
        if (LigneVente::where('proprietaire_id', $proprietaire->id)->exists()) {
            throw new RegleMetierException('Ce propriétaire a déjà des ventes : désactivez-le plutôt que de le supprimer, pour garder l’historique.');
        }
        $proprietaire->delete(); // ses produits redeviennent « non attribués » (nullOnDelete)
    }
}

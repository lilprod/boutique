<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Boutique tenue par plusieurs personnes : chaque pagne appartient à un propriétaire.
 * Option par boutique (désactivée par défaut) ; l'attribution passe par le produit,
 * avec des règles « motif → propriétaire » facultatives.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('proprietaires', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('boutique_id')->constrained()->cascadeOnDelete();
            $table->string('nom', 150);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete(); // compte lié, facultatif
            $table->boolean('actif')->default(true);
            $table->timestamps();
            $table->index(['tenant_id', 'boutique_id']);
        });

        Schema::create('proprietaire_motifs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('boutique_id')->constrained()->cascadeOnDelete();
            $table->foreignId('proprietaire_id')->constrained('proprietaires')->cascadeOnDelete();
            $table->string('motif', 100);
            $table->timestamps();
            $table->unique(['boutique_id', 'motif']); // un motif n'appartient qu'à une personne dans une boutique
        });

        Schema::table('parametres', function (Blueprint $table) {
            $table->boolean('multi_proprietaires')->default(false);
        });

        Schema::table('produits', function (Blueprint $table) {
            $table->foreignId('proprietaire_id')->nullable()->after('boutique_id')->constrained('proprietaires')->nullOnDelete();
        });

        Schema::table('lignes_vente', function (Blueprint $table) {
            // Propriétaire du pagne au moment de la vente (gelé, comme le libellé).
            $table->foreignId('proprietaire_id')->nullable()->after('produit_id')->constrained('proprietaires')->restrictOnDelete();
            // Total de la ligne après sa part de la remise globale du ticket : ce qui a réellement été encaissé pour elle.
            $table->unsignedInteger('net')->default(0)->after('total');
        });

        $this->remplirNet();
    }

    public function down(): void
    {
        Schema::table('lignes_vente', function (Blueprint $table) {
            $table->dropConstrainedForeignId('proprietaire_id');
            $table->dropColumn('net');
        });
        Schema::table('produits', function (Blueprint $table) {
            $table->dropConstrainedForeignId('proprietaire_id');
        });
        Schema::table('parametres', function (Blueprint $table) {
            $table->dropColumn('multi_proprietaires');
        });
        Schema::dropIfExists('proprietaire_motifs');
        Schema::dropIfExists('proprietaires');
    }

    /** Répartit la remise globale des ventes existantes sur leurs lignes (même règle que VenteService). */
    private function remplirNet(): void
    {
        DB::table('ventes')->select('id', 'remise_montant')->orderBy('id')->chunkById(500, function ($ventes) {
            foreach ($ventes as $vente) {
                $lignes = DB::table('lignes_vente')->where('vente_id', $vente->id)->orderBy('id')->get(['id', 'total']);
                foreach ($this->repartir($lignes->pluck('total', 'id')->all(), (int) $vente->remise_montant) as $id => $net) {
                    DB::table('lignes_vente')->where('id', $id)->update(['net' => $net]);
                }
            }
        });
    }

    /** Copie volontaire de VenteService::repartirRemise : une migration ne dépend pas du code qui évolue. */
    private function repartir(array $totaux, int $remise): array
    {
        $base = array_sum($totaux);
        if ($remise <= 0 || $base <= 0) {
            return $totaux;
        }
        $parts = [];
        $restes = [];
        foreach ($totaux as $id => $total) {
            $exact = $remise * $total / $base;
            $parts[$id] = (int) floor($exact);
            $restes[$id] = $exact - $parts[$id];
        }
        arsort($restes);
        foreach (array_slice(array_keys($restes), 0, $remise - array_sum($parts)) as $id) {
            $parts[$id]++;
        }

        return array_map(fn ($id) => $totaux[$id] - $parts[$id], array_combine(array_keys($totaux), array_keys($totaux)));
    }
};

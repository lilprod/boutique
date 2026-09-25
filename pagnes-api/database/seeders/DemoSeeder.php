<?php

namespace Database\Seeders;

use App\Models\Client;
use App\Models\Mouvement;
use App\Models\Parametre;
use App\Models\Produit;
use App\Models\User;
use App\Services\VenteService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Reproduit les données de démo de la Phase 1 (src/data/seed.ts) : mêmes comptes,
 * un catalogue de pagnes réduit, des clients togolais, et un historique de ventes.
 * Sans effet si les données existent déjà ; `php artisan migrate:fresh --seed` pour repartir de zéro.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        if (User::where('email', 'admin')->exists()) {
            $this->command?->warn('Données de démo déjà présentes : rien à faire (utilisez migrate:fresh --seed pour repartir de zéro).');
            return;
        }

        $admin =User::create(['nom' => 'Kafui Amegah', 'email' => 'admin', 'password' => Hash::make('admin123'), 'role' => 'admin', 'actif' => true]);
        $yawovi = User::create(['nom' => 'Yawovi Dossou', 'email' => 'yawovi', 'password' => Hash::make('vente123'), 'role' => 'vendeur', 'actif' => true]);
        $essenam = User::create(['nom' => 'Essenam Tagba', 'email' => 'essenam', 'password' => Hash::make('vente123'), 'role' => 'vendeur', 'actif' => true]);

        Parametre::create([
            'boutique' => 'Pagnes de Lomé', 'adresse' => 'Grand Marché de Lomé, allée des tissus', 'telephone' => '+228 90 00 00 00',
            'ticket_format' => '80mm', 'remise_max_vendeur' => 15,
            'message_ticket' => 'Merci de votre confiance. Les coupes de tissu ne sont ni reprises ni échangées.',
        ]);

        $coloris = [
            ['Orange & indigo', '#E07A1F', '#23306B'], ['Vert émeraude', '#1F8A5B', '#F2C230'], ['Jaune moutarde', '#E2A81B', '#7A2E12'],
            ['Bordeaux', '#8E1F2F', '#F0C36B'], ['Bleu roi', '#1E3FA0', '#F5E6B8'], ['Blanc cassé', '#F3EAD3', '#2A3A7A'],
        ];
        $catalogue = [
            ['Wax Hollandais Damier', 'Wax', 'Damier', 'Pays-Bas', 38000, 6, 27400],
            ['Wax Vlisco Éventail', 'Wax', 'Géométrique', 'Pays-Bas', 68000, 6, 50300],
            ['Kente Ashanti', 'Kente', 'Rayures tissées', 'Ghana', 120000, 12, 90000],
            ['Bazin Riche brodé', 'Bazin', 'Uni brodé', 'Mali', 26000, 5, 18200],
            ['Ankara Classique', 'Ankara', 'Floral', 'Nigéria', 15000, 6, 10200],
            ['Adire Indigo', 'Adire', 'Teinture indigo', 'Nigéria', 28000, 6, 19600],
        ];

        $variantes = collect();
        foreach ($catalogue as [$nom, $type, $motif, $origine, $prixPagne, $yards, $prixAchat]) {
            $produit = Produit::create([
                'nom' => $nom, 'type' => $type, 'motif' => $motif, 'origine' => $origine,
                'yards_par_pagne' => $yards, 'vend_pagne' => true, 'vend_yard' => true,
                'prix_pagne' => $prixPagne, 'prix_yard' => (int) round((($prixPagne / $yards) * 1.2) / 100) * 100,
                'prix_achat_pagne' => $prixAchat,
            ]);
            foreach (array_slice($coloris, 0, random_int(2, 4)) as $i => [$nomColoris, $c1, $c2]) {
                $stock = random_int(90, 240);
                $v = $produit->variantes()->create([
                    'coloris' => $nomColoris, 'sku' => strtoupper(substr($type, 0, 3)) . '-' . $produit->id . '-' . ($i + 1),
                    'c1' => $c1, 'c2' => $c2, 'stock' => $stock, 'seuil' => $yards >= 12 ? $yards * 2 : $yards * 3,
                ]);
                Mouvement::create([
                    'variante_id' => $v->id, 'type' => 'entree', 'yards' => $stock, 'user_id' => $admin->id,
                    'motif' => 'Stock initial', 'fournisseur' => 'Établissements Kponton', 'prix_achat_pagne' => $prixAchat,
                ]);
                $variantes->push($v);
            }
        }

        $quartiers = ['Tokoin', 'Bè', 'Agoè', 'Adidogomé', 'Hédzranawoé', 'Grand Marché'];
        $noms = ['Akossiwa Mensah', 'Afi Kokou', 'Ama Tchalla', 'Abla Amouzou', 'Adjoa Lawson', 'Mawuena Ayivi', 'Kossi Dogbé', 'Yawa Adjovi'];
        $clients = collect($noms)->map(fn ($nom) => Client::create([
            'nom' => $nom, 'telephone' => '+228 9' . random_int(0, 3) . ' ' . random_int(10, 99) . ' ' . random_int(10, 99) . ' ' . random_int(10, 99),
            'adresse' => $quartiers[array_rand($quartiers)] . ', Lomé',
        ]));

        // Quelques ventes de démonstration via le vrai service métier, pour que
        // stock, mouvements et numérotation restent cohérents entre eux.
        $service = app(VenteService::class);
        $vendeurs = [$admin, $yawovi, $essenam];
        $modes = ['especes', 'flooz', 'tmoney', 'carte'];
        for ($i = 0; $i < 20; $i++) {
            $variante = $variantes->random();
            if ($variante->stock < 6) continue;
            $vente = $service->valider(
                $vendeurs[array_rand($vendeurs)],
                [[ 'variante_id' => $variante->id, 'unite' => 'pagne', 'quantite' => [1, 1, 2][array_rand([1, 1, 2])],
                   'remise_type' => 'pct', 'remise_valeur' => 0 ]],
                random_int(0, 1) ? $clients->random()->id : null, 'pct', 0,
                ['mode' => $modes[array_rand($modes)], 'reference' => 'FZ' . random_int(100000000, 999999999)]
            );
            if ($i % 9 === 0) {
                $service->annuler($vente, $admin, 'Erreur de saisie');
            }
        }

        // Trois coloris volontairement sous le seuil, dont une rupture, pour tester les alertes.
        $variantes->take(3)->values()->each(fn ($v, $i) => $v->update(['stock' => $i === 0 ? 0 : $v->seuil * 0.6]));
    }
}

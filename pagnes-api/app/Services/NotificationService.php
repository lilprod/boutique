<?php

namespace App\Services;

use App\Models\License;
use App\Models\Payment;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Variante;
use Illuminate\Support\Carbon;

/**
 * Notifications de la cloche, calculées à la demande depuis l'état réel (pas de table) :
 * l'identifiant de chacune change quand la situation change (date d'expiration, statut),
 * ce qui permet au navigateur de retenir celles déjà lues. Les textes sont traduits dans
 * la langue de la requête (lang/en.json).
 *
 * Forme : ['id', 'niveau' (info|warn|bad), 'titre', 'message', 'date', 'lien' (route du frontend)].
 */
class NotificationService
{
    /** Délai avant expiration à partir duquel on prévient. */
    public const JOURS_ALERTE = 7;

    public function pourSuperAdmin(): array
    {
        $notifs = [];

        // Dernière licence de chaque entreprise : expirée, ou qui expire bientôt.
        $licences = License::with('tenant:id,nom')
            ->whereIn('id', License::selectRaw('MAX(id)')->groupBy('tenant_id'))
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now()->addDays(self::JOURS_ALERTE))
            ->orderBy('expires_at')->get();
        foreach ($licences as $l) {
            $notifs[] = $this->licence($l, $l->tenant?->nom ?? __('Entreprise'), '/tenants');
        }

        // Paiements à vérifier ou impayés.
        $enAttente = Payment::with('tenant:id,nom')->whereIn('status', ['pending', 'unpaid'])->latest()->limit(20)->get();
        foreach ($enAttente as $p) {
            $notifs[] = [
                'id' => "paiement-{$p->id}-{$p->status}",
                'niveau' => 'warn',
                'titre' => $p->status === 'pending' ? __('Paiement à vérifier') : __('Paiement impayé'),
                'message' => __(':entreprise · :montant FCFA · réf. :reference', [
                    'entreprise' => $p->tenant?->nom ?? __('Entreprise'), 'montant' => $this->montant($p->amount), 'reference' => $p->payment_reference ?? '—',
                ]),
                'date' => $p->created_at?->toIso8601String(),
                'lien' => '/paiements',
            ];
        }

        // Essais qui se terminent bientôt : à convertir en abonnement payant.
        $essais = Subscription::with('tenant:id,nom')->where('status', 'trial')
            ->whereBetween('trial_ends_at', [now(), now()->addDays(self::JOURS_ALERTE)])->get();
        foreach ($essais as $s) {
            $notifs[] = [
                'id' => "essai-{$s->id}-{$s->trial_ends_at->toDateString()}",
                'niveau' => 'info',
                'titre' => __('Fin d’essai proche'),
                'message' => __(':entreprise · essai jusqu’au :date', ['entreprise' => $s->tenant?->nom ?? __('Entreprise'), 'date' => $this->date($s->trial_ends_at)]),
                'date' => $s->trial_ends_at->toIso8601String(),
                'lien' => '/tenants',
            ];
        }

        return $this->trier($notifs);
    }

    public function pourTenant(Tenant $tenant): array
    {
        $notifs = [];

        $licence = $tenant->licenses()->latest('id')->first();
        if ($licence?->expires_at && $licence->expires_at->lessThanOrEqualTo(now()->addDays(self::JOURS_ALERTE))) {
            $notifs[] = $this->licence($licence, __('Votre licence'), '/');
        }

        foreach ($tenant->payments()->where('created_at', '>=', now()->subDays(30))->latest()->limit(10)->get() as $p) {
            $paye = $p->status === 'paid';
            $notifs[] = [
                'id' => "paiement-{$p->id}-{$p->status}",
                'niveau' => $paye ? 'info' : ($p->status === 'rejected' ? 'bad' : 'warn'),
                'titre' => match ($p->status) { 'paid' => __('Paiement reçu'), 'rejected' => __('Paiement refusé'), default => __('Paiement en cours de vérification') },
                'message' => $paye && $p->invoice_number
                    ? __(':montant FCFA · facture :facture', ['montant' => $this->montant($p->amount), 'facture' => $p->invoice_number])
                    : __(':montant FCFA', ['montant' => $this->montant($p->amount)]),
                'date' => $p->created_at?->toIso8601String(),
                'lien' => '/',
            ];
        }

        return $this->trier($notifs);
    }

    /**
     * Espace boutique : coloris en rupture et sous le seuil (regroupés, pour ne pas noyer la cloche)
     * et, pour un administrateur, la licence de l'entreprise qui expire.
     */
    public function pourBoutique(User $user): array
    {
        $notifs = [];
        $variantes = Variante::query()->forCurrentContext($user)->get(['id', 'stock', 'seuil']);
        $ruptures = $variantes->filter(fn ($v) => (float) $v->stock <= 0);
        $bas = $variantes->filter(fn ($v) => (float) $v->stock > 0 && (float) $v->stock <= (float) $v->seuil);

        if ($ruptures->isNotEmpty()) {
            $notifs[] = [
                // L'identifiant change dès que la liste des coloris concernés change.
                'id' => 'ruptures-'.md5($ruptures->pluck('id')->sort()->implode(',')),
                'niveau' => 'bad',
                'titre' => __('Ruptures de stock'),
                'message' => __(':n coloris en rupture : plus rien à vendre.', ['n' => $ruptures->count()]),
                'date' => now()->toIso8601String(),
                'lien' => '/stock',
            ];
        }
        if ($bas->isNotEmpty()) {
            $notifs[] = [
                'id' => 'stock-bas-'.md5($bas->pluck('id')->sort()->implode(',')),
                'niveau' => 'warn',
                'titre' => __('Stock à réapprovisionner'),
                'message' => __(':n coloris sous leur seuil d’alerte.', ['n' => $bas->count()]),
                'date' => now()->toIso8601String(),
                'lien' => '/stock',
            ];
        }

        if ($user->estAdmin() && $user->tenant_id) {
            $licence = License::where('tenant_id', $user->tenant_id)->latest('id')->first();
            if ($licence?->expires_at && $licence->expires_at->lessThanOrEqualTo(now()->addDays(self::JOURS_ALERTE))) {
                $notifs[] = $this->licence($licence, __('Licence de l’entreprise'), '/');
            }
        }

        return $this->trier($notifs);
    }

    private function licence(License $l, string $qui, string $lien): array
    {
        /** @var Carbon $fin */
        $fin = $l->expires_at;
        $expiree = $fin->isPast() || $l->status === 'expired';

        return [
            'id' => "licence-{$l->id}-{$fin->toDateString()}-".($expiree ? 'expiree' : 'bientot'),
            'niveau' => $expiree ? 'bad' : 'warn',
            'titre' => $expiree ? __('Licence expirée') : __('Licence bientôt expirée'),
            'message' => $expiree
                ? __(':qui · expirée depuis le :date : la caisse est bloquée.', ['qui' => $qui, 'date' => $this->date($fin)])
                : __(':qui · expire le :date (dans :n jour(s)).', ['qui' => $qui, 'date' => $this->date($fin), 'n' => max(0, (int) ceil(now()->diffInDays($fin)))]),
            'date' => $fin->toIso8601String(),
            'lien' => $lien,
        ];
    }

    /** Date courte dans la langue de la requête : « 18 oct. 2026 » / « 18 Oct 2026 ». */
    private function date(Carbon $d): string
    {
        return $d->copy()->locale(app()->getLocale())->translatedFormat('d M Y');
    }

    /** Montant FCFA avec espaces entre milliers (convention régionale, quelle que soit la langue). */
    private function montant(int|float $n): string
    {
        return number_format($n, 0, ',', ' ');
    }

    /** Problèmes d'abord, puis le plus récent. */
    private function trier(array $notifs): array
    {
        $poids = ['bad' => 0, 'warn' => 1, 'info' => 2];
        usort($notifs, fn ($a, $b) => [$poids[$a['niveau']], $b['date'] ?? ''] <=> [$poids[$b['niveau']], $a['date'] ?? '']);

        return $notifs;
    }
}

<div>
    <!-- Nothing in life is to be feared, it is only to be understood. Now is the time to understand more, so that we may fear less. - Maria Skłodowska-Curie -->
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Facture {{ $payment->invoice_number }}</title>
    <style>
        body { color: #20251f; font: 15px Arial, sans-serif; margin: 0; background: #eef1ed; }
        main { box-sizing: border-box; max-width: 760px; margin: 32px auto; padding: 48px; background: #fff; }
        header, .total { display: flex; justify-content: space-between; gap: 24px; }
        h1 { margin: 0 0 8px; font-size: 28px; }
        p { line-height: 1.5; }
        table { width: 100%; margin-top: 38px; border-collapse: collapse; }
        th, td { padding: 12px 8px; text-align: left; border-bottom: 1px solid #d9ded8; }
        th:last-child, td:last-child { text-align: right; }
        .total { margin-top: 18px; font-size: 20px; font-weight: 700; }
        .muted { color: #5d665d; }
        button { margin-top: 32px; padding: 10px 16px; border: 0; color: #fff; background: #24583e; cursor: pointer; }
        @media print { body { background: #fff; } main { margin: 0 auto; padding: 0; } button { display: none; } }
        @media (max-width: 600px) { main { margin: 0; padding: 24px; } header { display: block; } }
    </style>
</head>
<body>
<main>
    <header>
        <div>
            <h1>{{ $payment->status === 'paid' ? 'Facture acquittée' : 'Facture' }}</h1>
            <p class="muted">{{ $payment->invoice_number }}</p>
        </div>
        <div>
            <strong>{{ $payment->tenant?->nom }}</strong>
            <p class="muted">Émise le {{ ($payment->processed_at ?? $payment->created_at)?->format('d/m/Y') }}</p>
        </div>
    </header>
    <table>
        <thead><tr><th>Description</th><th>Référence</th><th>Statut</th><th>Montant</th></tr></thead>
        <tbody>
            <tr>
                <td>Abonnement {{ $payment->subscription?->plan?->nom ?? 'SaaS' }}</td>
                <td>{{ $payment->payment_reference }}</td>
                <td>{{ $payment->status }}</td>
                <td>{{ number_format($payment->amount, 0, ',', ' ') }} XOF</td>
            </tr>
        </tbody>
    </table>
    <div class="total"><span>Total</span><span>{{ number_format($payment->amount, 0, ',', ' ') }} XOF</span></div>
    <p class="muted">Mode de paiement : {{ $payment->payment_method }}</p>
    <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
</main>
</body>
</html>

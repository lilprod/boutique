<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ParametreController;
use App\Http\Controllers\Api\ProduitController;
use App\Http\Controllers\Api\PromotionController;
use App\Http\Controllers\Api\ProprietaireController;
use App\Http\Controllers\Api\StatistiqueController;
use App\Http\Controllers\Api\SuperAdminController;
use App\Http\Controllers\Api\TenantPortalController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VarianteController;
use App\Http\Controllers\Api\VenteController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware(['auth:sanctum', 'actif'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::middleware('tenant_active')->prefix('tenant')->group(function () {
        Route::get('/plans', [TenantPortalController::class, 'plans']);
        Route::get('/dashboard', [TenantPortalController::class, 'dashboard']);
        Route::get('/notifications', [TenantPortalController::class, 'notifications']);
        Route::get('/boutiques', [TenantPortalController::class, 'boutiques']);
        Route::get('/subscription', [TenantPortalController::class, 'subscription']);
        Route::get('/payments', [TenantPortalController::class, 'payments']);
        Route::get('/payments/{paymentId}/invoice', [TenantPortalController::class, 'invoice']);
        Route::get('/payments/{paymentId}/attachment', [TenantPortalController::class, 'attachment']);
        // Lecture seule : le renouvellement et le paiement se font côté super admin.
    });

    Route::middleware('super_admin')->prefix('super-admin')->group(function () {
        Route::get('/dashboard', [SuperAdminController::class, 'dashboard']);
        Route::get('/notifications', [SuperAdminController::class, 'notifications']);
        Route::get('/tenants', [SuperAdminController::class, 'index']);
        Route::get('/payments', [SuperAdminController::class, 'payments']);
        Route::get('/payments/export.csv', [SuperAdminController::class, 'exportPayments']);
        Route::get('/payments/{payment}/invoice', [SuperAdminController::class, 'invoice']);
        Route::get('/payments/{payment}/attachment', [SuperAdminController::class, 'attachment']);
        Route::post('/tenants', [SuperAdminController::class, 'storeTenant']);
        Route::post('/tenants/{tenant}/payments', [SuperAdminController::class, 'storePayment']);
        Route::post('/tenants/{tenant}/renouvellements', [SuperAdminController::class, 'renouveler']);
        Route::get('/plans', [SuperAdminController::class, 'plans']);
        Route::post('/plans', [SuperAdminController::class, 'storePlan']);
        Route::get('/tenants/{tenant}/subscription', [SuperAdminController::class, 'tenantSubscription']);
        Route::post('/tenants/{tenant}/subscribe', [SuperAdminController::class, 'subscribeTenant']);
        Route::put('/tenants/{tenant}/subscription-status', [SuperAdminController::class, 'updateSubscriptionStatus']);
    });

    Route::middleware(['boutique_context', 'tenant_active'])->group(function () {
        // Lecture ouverte aux vendeurs (caisse, consultation du stock).
        Route::get('produits', [ProduitController::class, 'index']);
        Route::get('mouvements', [VarianteController::class, 'mouvements']);
        Route::get('parametres', [ParametreController::class, 'show']);
        Route::get('proprietaires', [ProprietaireController::class, 'index']);
        Route::get('promotions', [PromotionController::class, 'index']);
        Route::get('notifications', [NotificationController::class, 'boutique']);

        Route::get('clients', [ClientController::class, 'index']);
        Route::post('clients', [ClientController::class, 'store']);
        Route::put('clients/{client}', [ClientController::class, 'update']);
        Route::get('clients/{client}/points', [ClientController::class, 'points']);

        Route::get('tableau-de-bord', [StatistiqueController::class, 'tableauDeBord']);

        Route::get('ventes', [VenteController::class, 'index']);
        Route::get('ventes/{vente}', [VenteController::class, 'show']);
        Route::post('ventes', [VenteController::class, 'store']);

        // Réservé à l'administrateur de cette boutique.
        Route::middleware('admin')->group(function () {
            Route::post('produits', [ProduitController::class, 'store']);
            Route::put('produits/{produit}', [ProduitController::class, 'update']);
            Route::delete('produits/{produit}', [ProduitController::class, 'destroy']);
            Route::post('produits/{produit}/image', [ProduitController::class, 'image']);
            Route::delete('produits/{produit}/image', [ProduitController::class, 'supprimerImage']);

            Route::get('fournisseurs', [StatistiqueController::class, 'fournisseurs']);
            Route::post('variantes/{variante}/entree', [VarianteController::class, 'entree']);
            Route::post('variantes/{variante}/ajuster', [VarianteController::class, 'ajuster']);

            Route::delete('clients/{client}', [ClientController::class, 'destroy']);
            Route::post('clients/{client}/points', [ClientController::class, 'ajusterPoints']);
            Route::post('ventes/{vente}/annuler', [VenteController::class, 'annuler']);

            Route::put('parametres', [ParametreController::class, 'update']);
            Route::apiResource('proprietaires', ProprietaireController::class)->only(['store', 'update', 'destroy']);
            Route::get('rapports/proprietaires', [ProprietaireController::class, 'rapport']);
            Route::apiResource('promotions', PromotionController::class)->only(['store', 'update', 'destroy']);
            Route::apiResource('users', UserController::class)->only(['index', 'store', 'update']);
        });
    });
});

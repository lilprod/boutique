<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\ParametreController;
use App\Http\Controllers\Api\ProduitController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VarianteController;
use App\Http\Controllers\Api\VenteController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware(['auth:sanctum', 'actif'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Lecture ouverte aux vendeurs (caisse, consultation du stock).
    Route::get('produits', [ProduitController::class, 'index']);
    Route::get('mouvements', [VarianteController::class, 'mouvements']);
    Route::get('parametres', [ParametreController::class, 'show']);

    Route::get('clients', [ClientController::class, 'index']);
    Route::post('clients', [ClientController::class, 'store']);
    Route::put('clients/{client}', [ClientController::class, 'update']);

    Route::get('ventes', [VenteController::class, 'index']);
    Route::get('ventes/{vente}', [VenteController::class, 'show']);
    Route::post('ventes', [VenteController::class, 'store']);

    // Réservé à l'administrateur, comme les boutons masqués côté frontend.
    Route::middleware('admin')->group(function () {
        Route::post('produits', [ProduitController::class, 'store']);
        Route::put('produits/{produit}', [ProduitController::class, 'update']);
        Route::delete('produits/{produit}', [ProduitController::class, 'destroy']);

        Route::post('variantes/{variante}/entree', [VarianteController::class, 'entree']);
        Route::post('variantes/{variante}/ajuster', [VarianteController::class, 'ajuster']);

        Route::delete('clients/{client}', [ClientController::class, 'destroy']);
        Route::post('ventes/{vente}/annuler', [VenteController::class, 'annuler']);

        Route::put('parametres', [ParametreController::class, 'update']);
        Route::apiResource('users', UserController::class)->only(['index', 'store', 'update']);
    });
});

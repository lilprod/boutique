<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /** Cloche de l'espace boutique : ruptures, stock bas et, pour l'administrateur, licence qui expire. */
    public function boutique(Request $request, NotificationService $notifications): JsonResponse
    {
        return response()->json($notifications->pourBoutique($request->user()));
    }
}

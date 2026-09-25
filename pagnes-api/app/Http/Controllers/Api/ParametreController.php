<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Parametre;
use Illuminate\Http\Request;

class ParametreController extends Controller
{
    public function show()
    {
        return Parametre::actuel();
    }

    /** Réservé à l'administrateur (voir routes/api.php). */
    public function update(Request $request)
    {
        $data = $request->validate([
            'boutique' => 'required|string|max:150',
            'adresse' => 'nullable|string|max:190',
            'telephone' => 'nullable|string|max:40',
            'ticket_format' => 'required|in:80mm,A4',
            'remise_max_vendeur' => 'required|integer|min:0|max:100',
            'message_ticket' => 'nullable|string|max:500',
        ]);
        $p = Parametre::actuel();
        $p->update($data);
        return response()->json($p);
    }
}

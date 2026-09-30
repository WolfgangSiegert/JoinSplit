<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateAccountPreferencesRequest;
use App\Models\Account;
use Illuminate\Http\JsonResponse;

class AccountPreferencesController extends Controller
{
    public function update(UpdateAccountPreferencesRequest $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user('web');
        $preferences = $request->validated();
        if (array_key_exists('groupAreaOrder', $preferences)) {
            $account->group_area_order = $preferences['groupAreaOrder'];
        }
        if (array_key_exists('languagePreference', $preferences)) {
            $account->language_preference = $preferences['languagePreference'];
        }
        if (array_key_exists('defaultGroupArea', $preferences)) {
            $account->default_group_area = $preferences['defaultGroupArea'];
        }
        $account->save();

        return response()->json(['data' => [
            'groupAreaOrder' => $account->group_area_order,
            'defaultGroupArea' => $account->default_group_area ?? 'expenses',
            'languagePreference' => $account->language_preference ?? 'system',
        ]]);
    }
}

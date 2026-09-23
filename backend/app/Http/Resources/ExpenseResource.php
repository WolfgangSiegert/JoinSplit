<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExpenseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'groupId' => $this->group_id,
            'description' => $this->description,
            'amountMinor' => $this->amount_minor,
            'incurredOn' => $this->incurred_on->format('Y-m-d'),
            'payerParticipantId' => $this->payer_participant_id,
            'creatorAccessIdentityId' => $this->creator_access_identity_id,
            'splitMethod' => $this->split_method,
            'shares' => $this->shares->map(fn ($share): array => [
                'participantId' => $share->participant_id,
                'amountMinor' => $share->amount_minor,
            ])->values()->all(),
        ];
    }
}

<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SettlementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'groupId' => $this->group_id,
            'senderParticipantId' => $this->sender_participant_id,
            'receiverParticipantId' => $this->receiver_participant_id,
            'amountMinor' => (string) $this->amount_minor,
            'occurredOn' => $this->occurred_on->format('Y-m-d'),
            'creatorAccessIdentityId' => $this->creator_access_identity_id,
        ];
    }
}

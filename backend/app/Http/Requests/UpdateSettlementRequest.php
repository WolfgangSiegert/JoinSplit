<?php

namespace App\Http\Requests;

class UpdateSettlementRequest extends SettlementRequest
{
    public function rules(): array
    {
        return $this->mutableRules();
    }

    protected function allowedKeys(): array
    {
        return [
            'senderParticipantId',
            'receiverParticipantId',
            'amountMinor',
            'occurredOn',
        ];
    }
}

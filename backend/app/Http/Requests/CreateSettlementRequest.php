<?php

namespace App\Http\Requests;

class CreateSettlementRequest extends SettlementRequest
{
    public function rules(): array
    {
        return ['settlementId' => ['required', 'string', 'uuid:4']] + $this->mutableRules();
    }

    protected function allowedKeys(): array
    {
        return [
            'settlementId',
            'senderParticipantId',
            'receiverParticipantId',
            'amountMinor',
            'occurredOn',
        ];
    }
}

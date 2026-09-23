<?php

namespace App\Http\Requests;

class UpdateExpenseRequest extends ExpenseRequest
{
    public function rules(): array
    {
        return $this->mutableRules();
    }

    protected function allowedKeys(): array
    {
        return [
            'description',
            'amountMinor',
            'incurredOn',
            'payerParticipantId',
            'participantIds',
        ];
    }
}

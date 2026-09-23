<?php

namespace App\Http\Requests;

class CreateExpenseRequest extends ExpenseRequest
{
    public function rules(): array
    {
        return ['expenseId' => ['required', 'string', 'uuid:4']] + $this->mutableRules();
    }

    protected function allowedKeys(): array
    {
        return [
            'expenseId',
            'description',
            'amountMinor',
            'incurredOn',
            'payerParticipantId',
            'participantIds',
        ];
    }
}

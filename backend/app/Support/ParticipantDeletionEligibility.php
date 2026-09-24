<?php

namespace App\Support;

use App\Models\Participant;

class ParticipantDeletionEligibility
{
    public function allows(Participant $participant): bool
    {
        return ! $this->hasFinancialReferences($participant);
    }

    private function hasFinancialReferences(Participant $participant): bool
    {
        return $participant->paidExpenses()->exists()
            || $participant->expenseShares()->exists()
            || $participant->sentSettlements()->exists()
            || $participant->receivedSettlements()->exists();
    }
}

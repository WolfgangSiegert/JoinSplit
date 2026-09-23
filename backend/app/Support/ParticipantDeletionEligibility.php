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
        // JS-016 has no financial models. This boundary is where their references are added later.
        return false;
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ImportAccountGroupRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'importId' => ['required', 'string', 'uuid:4'],
            'snapshot' => ['required', 'array:group,participants,expenses,settlements'],
            'snapshot.group' => ['required', 'array:id,name,currency,ownerAccessIdentityId,status,hasFinancialHistory'],
            'snapshot.group.id' => ['required', 'string', 'uuid:4'],
            'snapshot.group.name' => ['required', 'string', 'max:100'],
            'snapshot.group.currency' => ['required', 'in:EUR'],
            'snapshot.group.ownerAccessIdentityId' => ['required', 'string', 'uuid:4'],
            'snapshot.group.status' => ['required', 'in:active,archived'],
            'snapshot.group.hasFinancialHistory' => ['required', 'boolean'],
            'snapshot.participants' => ['required', 'array'],
            'snapshot.participants.*' => ['array:id,groupId,name,status,order'],
            'snapshot.participants.*.id' => ['required', 'string', 'uuid:4', 'distinct'],
            'snapshot.participants.*.groupId' => ['required', 'string', 'uuid:4'],
            'snapshot.participants.*.name' => ['required', 'string', 'max:100'],
            'snapshot.participants.*.status' => ['required', 'in:active,inactive'],
            'snapshot.participants.*.order' => ['required', 'integer', 'min:0', 'distinct'],
            'snapshot.expenses' => ['required', 'array'],
            'snapshot.expenses.*' => ['array:id,groupId,description,amountMinor,incurredOn,payerParticipantId,creatorAccessIdentityId,splitMethod,shares'],
            'snapshot.expenses.*.id' => ['required', 'string', 'uuid:4', 'distinct'],
            'snapshot.expenses.*.groupId' => ['required', 'string', 'uuid:4'],
            'snapshot.expenses.*.description' => ['required', 'string', 'max:200'],
            'snapshot.expenses.*.amountMinor' => ['required', 'integer', 'min:1', 'max:9007199254740991'],
            'snapshot.expenses.*.incurredOn' => ['required', 'date_format:Y-m-d'],
            'snapshot.expenses.*.payerParticipantId' => ['required', 'string', 'uuid:4'],
            'snapshot.expenses.*.creatorAccessIdentityId' => ['required', 'string', 'uuid:4'],
            'snapshot.expenses.*.splitMethod' => ['required', 'in:equal'],
            'snapshot.expenses.*.shares' => ['required', 'array', 'min:1'],
            'snapshot.expenses.*.shares.*' => ['array:participantId,amountMinor'],
            'snapshot.expenses.*.shares.*.participantId' => ['required', 'string', 'uuid:4', 'distinct'],
            'snapshot.expenses.*.shares.*.amountMinor' => ['required', 'integer', 'min:0', 'max:9007199254740991'],
            'snapshot.settlements' => ['required', 'array'],
            'snapshot.settlements.*' => ['array:id,groupId,senderParticipantId,receiverParticipantId,amountMinor,occurredOn,creatorAccessIdentityId'],
            'snapshot.settlements.*.id' => ['required', 'string', 'uuid:4', 'distinct'],
            'snapshot.settlements.*.groupId' => ['required', 'string', 'uuid:4'],
            'snapshot.settlements.*.senderParticipantId' => ['required', 'string', 'uuid:4'],
            'snapshot.settlements.*.receiverParticipantId' => ['required', 'string', 'uuid:4', 'different:snapshot.settlements.*.senderParticipantId'],
            'snapshot.settlements.*.amountMinor' => ['required', 'regex:/^[1-9][0-9]{0,18}$/'],
            'snapshot.settlements.*.occurredOn' => ['required', 'date_format:Y-m-d'],
            'snapshot.settlements.*.creatorAccessIdentityId' => ['required', 'string', 'uuid:4'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $snapshot = $this->input('snapshot');
            if (! is_array($snapshot) || ! is_array($snapshot['group'] ?? null)) {
                return;
            }

            $groupId = $snapshot['group']['id'] ?? null;
            $ownerId = $snapshot['group']['ownerAccessIdentityId'] ?? null;
            $participants = is_array($snapshot['participants'] ?? null) ? $snapshot['participants'] : [];
            $participantIds = array_column($participants, 'id');
            $known = array_fill_keys(array_filter($participantIds, 'is_string'), true);

            foreach ($participants as $index => $participant) {
                if (($participant['groupId'] ?? null) !== $groupId) {
                    $validator->errors()->add("snapshot.participants.$index.groupId", 'Participant must belong to the imported Group.');
                }
            }

            foreach (($snapshot['expenses'] ?? []) as $index => $expense) {
                if (($expense['groupId'] ?? null) !== $groupId
                    || ($expense['creatorAccessIdentityId'] ?? null) !== $ownerId
                    || ! isset($known[$expense['payerParticipantId'] ?? ''])) {
                    $validator->errors()->add("snapshot.expenses.$index", 'Expense relationships are inconsistent.');
                    continue;
                }
                $sum = 0;
                foreach (($expense['shares'] ?? []) as $share) {
                    if (! isset($known[$share['participantId'] ?? ''])) {
                        $validator->errors()->add("snapshot.expenses.$index.shares", 'Expense share Participant is unknown.');
                    }
                    $sum += is_int($share['amountMinor'] ?? null) ? $share['amountMinor'] : 0;
                }
                if (is_int($expense['amountMinor'] ?? null) && $sum !== $expense['amountMinor']) {
                    $validator->errors()->add("snapshot.expenses.$index.shares", 'Expense shares must equal the Expense amount.');
                }
            }

            foreach (($snapshot['settlements'] ?? []) as $index => $settlement) {
                $amount = $settlement['amountMinor'] ?? null;
                if (($settlement['groupId'] ?? null) !== $groupId
                    || ($settlement['creatorAccessIdentityId'] ?? null) !== $ownerId
                    || ! isset($known[$settlement['senderParticipantId'] ?? ''])
                    || ! isset($known[$settlement['receiverParticipantId'] ?? ''])
                    || (is_string($amount) && (strlen($amount) > 19
                        || (strlen($amount) === 19 && strcmp($amount, '9223372036854775807') > 0)))) {
                    $validator->errors()->add("snapshot.settlements.$index", 'Settlement relationships or amount are inconsistent.');
                }
            }

            $hasHistory = (bool) ($snapshot['group']['hasFinancialHistory'] ?? false);
            if ($hasHistory !== (! empty($snapshot['expenses']) || ! empty($snapshot['settlements']))) {
                $validator->errors()->add('snapshot.group.hasFinancialHistory', 'Financial-history marker is inconsistent.');
            }
        }];
    }
}

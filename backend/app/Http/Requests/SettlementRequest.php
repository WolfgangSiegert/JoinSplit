<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

abstract class SettlementRequest extends FormRequest
{
    private const MAX_AMOUNT_MINOR = '9223372036854775807';

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    protected function mutableRules(): array
    {
        return [
            'senderParticipantId' => ['required', 'string', 'uuid:4'],
            'receiverParticipantId' => ['required', 'string', 'uuid:4', 'different:senderParticipantId'],
            'amountMinor' => [
                'required',
                'string',
                'regex:/^[1-9][0-9]{0,18}$/D',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value)
                        && (strlen($value) > strlen(self::MAX_AMOUNT_MINOR)
                            || (strlen($value) === strlen(self::MAX_AMOUNT_MINOR)
                                && strcmp($value, self::MAX_AMOUNT_MINOR) > 0))) {
                        $fail("The {$attribute} field is outside the supported range.");
                    }
                },
            ],
            'occurredOn' => ['required', 'string', 'date_format:Y-m-d'],
        ];
    }

    /** @return list<callable> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $senderId = $this->input('senderParticipantId');
            $receiverId = $this->input('receiverParticipantId');
            if (is_string($senderId)
                && is_string($receiverId)
                && strtolower($senderId) === strtolower($receiverId)) {
                $validator->errors()->add(
                    'receiverParticipantId',
                    'The receiver participant id field must be different from sender participant id.',
                );
            }

            $unexpected = array_diff(array_keys($this->all()), $this->allowedKeys());
            foreach ($unexpected as $key) {
                $validator->errors()->add($key, 'The field is not allowed.');
            }
        }];
    }

    /** @return list<string> */
    abstract protected function allowedKeys(): array;
}

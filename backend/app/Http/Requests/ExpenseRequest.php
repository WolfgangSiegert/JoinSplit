<?php

namespace App\Http\Requests;

use App\Support\NameNormalizer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

abstract class ExpenseRequest extends FormRequest
{
    protected const MAX_SAFE_INTEGER = 9007199254740991;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('description'))) {
            $this->merge(['description' => NameNormalizer::normalize($this->input('description'))]);
        }
    }

    /** @return array<string, list<string>> */
    protected function mutableRules(): array
    {
        return [
            'description' => ['required', 'string', 'max:200'],
            'amountMinor' => ['required', 'integer', 'min:1', 'max:'.self::MAX_SAFE_INTEGER],
            'incurredOn' => ['required', 'string', 'date_format:Y-m-d'],
            'payerParticipantId' => ['required', 'string', 'uuid:4'],
            'participantIds' => ['required', 'array', 'min:1'],
            'participantIds.*' => ['required', 'string', 'uuid:4'],
        ];
    }

    /** @return list<callable> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($this->has('amountMinor') && ! is_int($this->input('amountMinor'))) {
                $validator->errors()->add('amountMinor', 'The amount minor field must be a JSON integer.');
            }

            if ($this->has('participantIds')
                && is_array($this->input('participantIds'))
                && ! array_is_list($this->input('participantIds'))) {
                $validator->errors()->add('participantIds', 'The participant ids field must be a JSON list.');
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

<?php

namespace App\Http\Requests;

use App\Support\NameNormalizer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateParticipantRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) $this->merge(['name' => NameNormalizer::normalize($this->input('name'))]);
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'active' => ['sometimes', 'required', 'boolean'],
            'personId' => ['sometimes', 'nullable', 'string', 'uuid:4'],
            'participantId' => ['prohibited'], 'groupId' => ['prohibited'], 'order' => ['prohibited'],
            'ownerId' => ['prohibited'], 'owner_id' => ['prohibited'], 'ownerAccessIdentityId' => ['prohibited'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $fields = array_filter(['name', 'active', 'personId'], fn (string $field): bool => array_key_exists($field, $this->all()));
            if (count($fields) !== 1) {
                $validator->errors()->add('participant', 'Rename, status change and Person association must be separate operations.');
            }
        }];
    }
}

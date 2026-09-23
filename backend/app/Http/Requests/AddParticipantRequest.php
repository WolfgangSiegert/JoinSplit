<?php

namespace App\Http\Requests;

use App\Support\NameNormalizer;
use Illuminate\Foundation\Http\FormRequest;

class AddParticipantRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) $this->merge(['name' => NameNormalizer::normalize($this->input('name'))]);
    }

    public function rules(): array
    {
        return [
            'participantId' => ['required', 'string', 'uuid:4'],
            'name' => ['required', 'string', 'max:100'],
            'order' => ['required', 'integer', 'min:0'],
            'ownerId' => ['prohibited'], 'owner_id' => ['prohibited'], 'ownerAccessIdentityId' => ['prohibited'],
        ];
    }
}

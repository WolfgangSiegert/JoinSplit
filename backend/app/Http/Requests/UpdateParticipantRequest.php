<?php

namespace App\Http\Requests;

use App\Support\NameNormalizer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
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
            'name' => ['sometimes', 'required', 'string', 'max:100', 'required_without:active'],
            'active' => ['sometimes', 'required', Rule::in([false]), 'required_without:name'],
            'participantId' => ['prohibited'], 'groupId' => ['prohibited'], 'order' => ['prohibited'],
            'ownerId' => ['prohibited'], 'owner_id' => ['prohibited'], 'ownerAccessIdentityId' => ['prohibited'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($this->has('name') && $this->has('active')) {
                $validator->errors()->add('active', 'Rename and deactivate must be separate operations.');
            }
        }];
    }
}

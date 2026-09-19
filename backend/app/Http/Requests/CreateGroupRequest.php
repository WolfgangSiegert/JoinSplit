<?php

namespace App\Http\Requests;

use App\Support\NameNormalizer;
use Illuminate\Foundation\Http\FormRequest;

class CreateGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];

        if (is_string($this->input('name'))) {
            $normalized['name'] = NameNormalizer::normalize($this->input('name'));
        }

        if (is_string($this->input('initialParticipant.name'))) {
            $initialParticipant = $this->input('initialParticipant');
            $initialParticipant['name'] = NameNormalizer::normalize($initialParticipant['name']);
            $normalized['initialParticipant'] = $initialParticipant;
        }

        $this->merge($normalized);
    }

    public function rules(): array
    {
        return [
            'groupId' => ['required', 'string', 'uuid:4'],
            'name' => ['required', 'string', 'max:100'],
            'currency' => ['required', 'string', 'in:EUR'],
            'actorId' => ['required', 'string', 'uuid:4'],
            'initialParticipant' => ['present', 'nullable', 'array:participantId,name'],
            'initialParticipant.participantId' => ['required_with:initialParticipant', 'string', 'uuid:4', 'different:groupId'],
            'initialParticipant.name' => ['required_with:initialParticipant', 'string', 'max:100'],
            'owner_id' => ['prohibited'],
            'ownerId' => ['prohibited'],
            'ownerAccessIdentityId' => ['prohibited'],
        ];
    }
}

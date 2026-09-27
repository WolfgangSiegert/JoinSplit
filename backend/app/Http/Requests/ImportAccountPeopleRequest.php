<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ImportAccountPeopleRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'importId' => ['required', 'string', 'uuid:4'],
            'people' => ['present', 'array'],
            'people.*' => ['array:id,name,status'],
            'people.*.id' => ['required', 'string', 'uuid:4', 'distinct'],
            'people.*.name' => ['required', 'string', 'max:100'],
            'people.*.status' => ['required', 'in:active,inactive'],
            'associations' => ['present', 'array'],
            'associations.*' => ['array:participantId,personId'],
            'associations.*.participantId' => ['required', 'string', 'uuid:4', 'distinct'],
            'associations.*.personId' => ['required', 'string', 'uuid:4'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $people = is_array($this->input('people')) ? $this->input('people') : [];
            $known = array_fill_keys(array_filter(array_column($people, 'id'), 'is_string'), true);

            foreach ((array) $this->input('associations', []) as $index => $association) {
                if (! is_array($association) || ! isset($known[$association['personId'] ?? ''])) {
                    $validator->errors()->add("associations.$index.personId", 'Association Person is not part of this adoption.');
                }
            }
        }];
    }
}

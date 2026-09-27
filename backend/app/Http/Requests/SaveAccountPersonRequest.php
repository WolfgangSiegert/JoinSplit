<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SaveAccountPersonRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'person' => ['required', 'array:id,name,status'],
            'person.id' => ['required', 'string', 'uuid:4'],
            'person.name' => ['required', 'string', 'max:100'],
            'person.status' => ['required', 'in:active,inactive'],
        ];
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Rule;

class RegisterAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', 'max:254'],
            'password' => ['required', 'string', 'confirmed', 'max:128', Password::min(12)],
            'dataAdoptionConfirmed' => ['accepted'],
            'groupAreaOrder' => ['sometimes', 'array', 'size:3'],
            'groupAreaOrder.*' => ['required', 'string', 'distinct', Rule::in(['expenses', 'settlement', 'people'])],
            'defaultGroupArea' => ['sometimes', 'string', Rule::in(['expenses', 'settlement', 'people'])],
            'languagePreference' => ['sometimes', 'string', Rule::in(['system', 'de', 'en'])],
        ];
    }
}

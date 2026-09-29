<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAccountPreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'groupAreaOrder' => ['required_without:languagePreference', 'array', 'size:3'],
            'groupAreaOrder.*' => ['required_with:groupAreaOrder', 'string', 'distinct', Rule::in(['expenses', 'settlement', 'people'])],
            'languagePreference' => ['required_without:groupAreaOrder', 'string', Rule::in(['system', 'de', 'en'])],
        ];
    }
}

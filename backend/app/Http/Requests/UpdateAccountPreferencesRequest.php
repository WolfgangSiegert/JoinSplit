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
            'groupAreaOrder' => ['required_without_all:languagePreference,defaultGroupArea', 'array', 'size:3'],
            'groupAreaOrder.*' => ['required_with:groupAreaOrder', 'string', 'distinct', Rule::in(['expenses', 'settlement', 'people'])],
            'defaultGroupArea' => ['required_without_all:groupAreaOrder,languagePreference', 'string', Rule::in(['expenses', 'settlement', 'people'])],
            'languagePreference' => ['required_without_all:groupAreaOrder,defaultGroupArea', 'string', Rule::in(['system', 'de', 'en'])],
        ];
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class ChangeAccountPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'currentPassword' => ['required', 'string', 'max:128'],
            'password' => ['required', 'string', 'confirmed', 'max:128', Password::min(12)],
        ];
    }
}

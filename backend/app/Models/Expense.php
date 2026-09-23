<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Expense extends Model
{
    use HasUuids;

    protected $fillable = [
        'id',
        'description',
        'amount_minor',
        'incurred_on',
        'payer_participant_id',
        'creator_access_identity_id',
        'split_method',
    ];

    protected function casts(): array
    {
        return [
            'amount_minor' => 'integer',
            'incurred_on' => 'date:Y-m-d',
        ];
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }

    public function payer(): BelongsTo
    {
        return $this->belongsTo(Participant::class, 'payer_participant_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(AccessIdentity::class, 'creator_access_identity_id');
    }

    public function shares(): HasMany
    {
        return $this->hasMany(ExpenseShare::class);
    }
}

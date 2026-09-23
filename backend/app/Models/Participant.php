<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Participant extends Model
{
    use HasUuids;

    protected $fillable = ['id', 'name', 'is_active', 'position'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }

    public function paidExpenses(): HasMany
    {
        return $this->hasMany(Expense::class, 'payer_participant_id');
    }

    public function expenseShares(): HasMany
    {
        return $this->hasMany(ExpenseShare::class);
    }
}

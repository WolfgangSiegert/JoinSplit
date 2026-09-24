<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Group extends Model
{
    use HasUuids;

    protected $fillable = ['id', 'name', 'currency', 'is_active'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'has_financial_history' => 'boolean',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(AccessIdentity::class, 'owner_access_identity_id');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(Participant::class)->orderBy('position');
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    public function settlements(): HasMany
    {
        return $this->hasMany(Settlement::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Person extends Model
{
    use HasUuids;

    protected $fillable = ['id', 'account_id', 'name', 'is_active', 'revision'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'revision' => 'integer'];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function participants(): HasMany
    {
        return $this->hasMany(Participant::class);
    }
}

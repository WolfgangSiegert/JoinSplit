<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccessIdentity extends Model
{
    use HasUuids;

    protected $fillable = ['id', 'credential_digest', 'account_id', 'linked_at', 'last_mutated_at'];

    protected $hidden = ['credential_digest'];

    protected function casts(): array
    {
        return [
            'linked_at' => 'datetime',
            'last_mutated_at' => 'datetime',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function groups(): HasMany
    {
        return $this->hasMany(Group::class, 'owner_access_identity_id');
    }
}

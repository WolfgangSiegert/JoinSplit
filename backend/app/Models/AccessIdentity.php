<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccessIdentity extends Model
{
    use HasUuids;

    protected $fillable = ['id', 'credential_digest', 'last_mutated_at'];

    protected $hidden = ['credential_digest'];

    protected function casts(): array
    {
        return ['last_mutated_at' => 'datetime'];
    }

    public function groups(): HasMany
    {
        return $this->hasMany(Group::class, 'owner_access_identity_id');
    }
}

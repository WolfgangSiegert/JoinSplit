<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccessIdentity extends Model
{
    use HasUuids;

    protected $fillable = ['id', 'credential_digest'];

    protected $hidden = ['credential_digest'];

    public function groups(): HasMany
    {
        return $this->hasMany(Group::class, 'owner_access_identity_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Settlement extends Model
{
    use HasUuids;

    protected $fillable = [
        'id',
        'sender_participant_id',
        'receiver_participant_id',
        'amount_minor',
        'occurred_on',
        'creator_access_identity_id',
    ];

    protected function casts(): array
    {
        return [
            'amount_minor' => 'integer',
            'occurred_on' => 'date:Y-m-d',
        ];
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(Participant::class, 'sender_participant_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(Participant::class, 'receiver_participant_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(AccessIdentity::class, 'creator_access_identity_id');
    }
}

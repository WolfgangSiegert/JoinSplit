<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GroupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $participant = $this->participants->first();

        return [
            'group' => [
                'id' => $this->id,
                'name' => $this->name,
                'currency' => $this->currency,
                'status' => $this->is_active ? 'active' : 'inactive',
                'ownerAccessIdentityId' => $this->owner_access_identity_id,
            ],
            'initialParticipant' => $participant ? [
                'id' => $participant->id,
                'groupId' => $participant->group_id,
                'name' => $participant->name,
                'status' => $participant->is_active ? 'active' : 'inactive',
                'order' => $participant->position,
            ] : null,
        ];
    }
}

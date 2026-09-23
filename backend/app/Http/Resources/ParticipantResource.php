<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ParticipantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'groupId' => $this->group_id,
            'name' => $this->name,
            'active' => $this->is_active,
            'order' => $this->position,
        ];
    }
}

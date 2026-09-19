<?php

namespace App\Support;

final class NameNormalizer
{
    private const EDGE_WHITESPACE = '/^[\x{0009}-\x{000D}\x{0020}\x{0085}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+|[\x{0009}-\x{000D}\x{0020}\x{0085}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+$/u';

    public static function normalize(string $value): string
    {
        return preg_replace(self::EDGE_WHITESPACE, '', $value) ?? $value;
    }
}

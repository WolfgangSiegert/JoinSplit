export interface SettlementOverviewBalanceImageRow {
  readonly name: string
  readonly status: 'active' | 'inactive'
  readonly state: 'receives' | 'pays' | 'balanced'
  readonly amount: string
}

export interface SettlementOverviewTransferImageRow {
  readonly sender: string
  readonly receiver: string
  readonly amount: string
}

export interface SettlementOverviewImageInput {
  readonly groupName: string
  readonly generatedAt: Date
  readonly containsUnsyncedChanges: boolean
  readonly balances: readonly SettlementOverviewBalanceImageRow[]
  readonly transfers: readonly SettlementOverviewTransferImageRow[] | null
  readonly proposalMessage?: string
}

export interface SettlementOverviewImage {
  readonly blob: Blob
  readonly dataUrl: string
}

const WIDTH = 1080
const PADDING = 72
const INK = '#15191f'
const MUTED = '#59636d'
const LINE = '#d7d4cc'
const BLUE = '#155eef'
const PAPER = '#f8f6f0'
const SURFACE = '#ffffff'

export function createSettlementOverviewImage(input: SettlementOverviewImageInput): SettlementOverviewImage {
  if (!import.meta.client) throw new Error('Settlement overview images are only available in the browser.')

  const proposalRows = input.transfers?.length ?? 1
  const height = 460 + input.balances.length * 94 + proposalRows * 112 + 250
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')

  context.fillStyle = PAPER
  context.fillRect(0, 0, WIDTH, height)
  let y = 72

  context.fillStyle = BLUE
  context.font = '800 34px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText('JoinSplit', PADDING, y)

  y += 72
  context.fillStyle = MUTED
  context.font = '700 22px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText('AUSGLEICHSÜBERSICHT', PADDING, y)
  y += 48
  context.fillStyle = INK
  context.font = '800 50px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText(fitText(context, input.groupName, WIDTH - PADDING * 2), PADDING, y)
  y += 42
  context.fillStyle = MUTED
  context.font = '500 21px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText(`Fixierter Stand vom ${formatInstant(input.generatedAt)}`, PADDING, y)

  if (input.containsUnsyncedChanges) {
    y += 38
    context.fillStyle = '#8a5c00'
    context.font = '650 20px "Avenir Next", "Segoe UI", sans-serif'
    context.fillText('Enthält noch nicht synchronisierte lokale Änderungen', PADDING, y)
  }

  y += 64
  drawSectionTitle(context, 'Salden pro Person', y)
  y += 34
  for (const balance of input.balances) {
    y += 70
    context.fillStyle = INK
    context.font = '700 27px "Avenir Next", "Segoe UI", sans-serif'
    const suffix = balance.status === 'inactive' ? ' · inaktiv' : ''
    context.fillText(fitText(context, `${balance.name}${suffix}`, 570), PADDING, y)
    context.textAlign = 'right'
    context.font = '800 29px "Avenir Next", "Segoe UI", sans-serif'
    context.fillText(balance.amount, WIDTH - PADDING, y)
    context.textAlign = 'left'
    context.fillStyle = MUTED
    context.font = '500 19px "Avenir Next", "Segoe UI", sans-serif'
    context.fillText(balanceStateLabel(balance.state), PADDING, y + 29)
    drawLine(context, y + 48)
  }

  y += 108
  drawSectionTitle(context, 'So gleicht ihr aus', y)
  y += 44
  context.fillStyle = MUTED
  context.font = '600 20px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText('Vorschlag · noch nicht als Zahlung verbucht', PADDING, y)

  if (input.transfers?.length) {
    for (const [index, transfer] of input.transfers.entries()) {
      y += 48
      drawTransferCard(context, y, index + 1, transfer)
      y += 88
    }
  } else {
    y += 52
    context.fillStyle = SURFACE
    roundedRect(context, PADDING, y, WIDTH - PADDING * 2, 88, 18)
    context.fill()
    context.fillStyle = INK
    context.font = '650 23px "Avenir Next", "Segoe UI", sans-serif'
    context.fillText(input.proposalMessage ?? 'Keine Ausgleichszahlung nötig.', PADDING + 28, y + 53)
    y += 88
  }

  y += 72
  drawLine(context, y)
  y += 48
  context.fillStyle = MUTED
  context.font = '500 18px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText('Lokal mit JoinSplit erstellt · Diese Abbildung gewährt keinen Zugriff auf die Gruppe.', PADDING, y)

  const dataUrl = canvas.toDataURL('image/png')
  const encoded = dataUrl.split(',')[1]
  if (!encoded) throw new Error('PNG generation failed.')
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return {
    blob: new Blob([bytes], { type: 'image/png' }),
    dataUrl,
  }
}

function drawSectionTitle(context: CanvasRenderingContext2D, title: string, y: number): void {
  context.fillStyle = INK
  context.font = '800 31px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText(title, PADDING, y)
}

function drawTransferCard(
  context: CanvasRenderingContext2D,
  y: number,
  index: number,
  transfer: SettlementOverviewTransferImageRow,
): void {
  const width = WIDTH - PADDING * 2
  context.fillStyle = SURFACE
  roundedRect(context, PADDING, y, width, 112, 18)
  context.fill()

  context.fillStyle = BLUE
  context.font = '800 22px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText(String(index), PADDING + 26, y + 67)

  context.fillStyle = INK
  context.font = '700 25px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText(fitText(context, transfer.sender, 180), PADDING + 78, y + 67)

  const caretY = y + 42
  drawTransferCaret(context, 338, caretY, '#b95f52')
  drawTransferCaret(context, 380, caretY, '#7d7294')
  drawTransferCaret(context, 422, caretY, '#4f72b0')
  drawTransferCaret(context, 636, caretY, '#4d88a3')
  drawTransferCaret(context, 678, caretY, '#5b83a8')
  drawTransferCaret(context, 720, caretY, '#3d8064')

  context.textAlign = 'center'
  context.fillStyle = INK
  context.font = '800 32px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText(transfer.amount, WIDTH / 2, y + 69)
  context.textAlign = 'right'
  context.font = '700 25px "Avenir Next", "Segoe UI", sans-serif'
  context.fillText(fitText(context, transfer.receiver, 180), WIDTH - PADDING - 26, y + 67)
  context.textAlign = 'left'
}

function drawTransferCaret(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  context.save()
  context.translate(x, y)
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(8, 0)
  context.lineTo(22, 14)
  context.lineTo(8, 28)
  context.lineTo(0, 28)
  context.lineTo(14, 14)
  context.closePath()
  context.fillStyle = color
  context.fill()
  context.restore()
}

function drawLine(context: CanvasRenderingContext2D, y: number): void {
  context.strokeStyle = LINE
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(PADDING, y)
  context.lineTo(WIDTH - PADDING, y)
  context.stroke()
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (context.measureText(value).width <= maxWidth) return value
  let fitted = value
  while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1)
  return `${fitted.trimEnd()}…`
}

function balanceStateLabel(state: SettlementOverviewBalanceImageRow['state']): string {
  if (state === 'receives') return 'soll erhalten'
  if (state === 'pays') return 'soll zahlen'
  return 'ausgeglichen'
}

function formatInstant(value: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

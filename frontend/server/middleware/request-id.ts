import { setResponseHeader } from 'h3'
import { serverRequestId } from '../utils/request-id'

export default defineEventHandler((event) => {
  const requestId = serverRequestId()

  event.context.joinsplitRequestId = requestId
  setResponseHeader(event, 'X-Request-ID', requestId)
})

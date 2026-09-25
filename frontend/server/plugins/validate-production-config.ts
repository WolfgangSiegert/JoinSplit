import { productionConfigurationErrors } from '../utils/production-config'

export default defineNitroPlugin(() => {
  const errors = productionConfigurationErrors(process.env)
  if (errors.length > 0) {
    throw new Error('Invalid production configuration: ' + errors.join(', '))
  }
})

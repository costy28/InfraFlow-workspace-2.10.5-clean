import { useCallback, useState } from 'react'

export default function useApi(request) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const response = await request(...args)
      setData(response.data)
      return response.data
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [request])

  return { data, error, loading, run }
}

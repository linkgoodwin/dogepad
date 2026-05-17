import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Revival() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/dao', { replace: true }) }, [navigate])
  return null
}

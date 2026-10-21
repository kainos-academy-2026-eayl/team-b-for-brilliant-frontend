import { Router } from 'express'
import { showHome } from '../controllers/home'

export const homeRouter = Router()

homeRouter.get('/', showHome)

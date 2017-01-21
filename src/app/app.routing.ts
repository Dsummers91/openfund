import { ModuleWithProviders } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { HomeComponent } from './home/home.component';
import { AboutComponent } from './about/about.component';
import { ProjectModule} from './project/project.module';

const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
   {
     path: 'about',
     component: AboutComponent
   },
   {
     path: 'project',
     component: ProjectModule
   }
  ]

export const AppRouting: ModuleWithProviders = RouterModule.forRoot(routes)
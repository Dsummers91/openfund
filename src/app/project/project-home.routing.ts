import { ModuleWithProviders } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProjectHomeComponent } from './project-home.component';

const routes: Routes = [
  {
    path: 'project',
    component: ProjectHomeComponent
  }
]

export const ProjectHomeRouting: ModuleWithProviders = RouterModule.forRoot(routes)
import { ModuleWithProviders } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProjectHomeComponent } from './project-home.component';

const routes: Routes = [
  {
    path: ':repo',
    component: ProjectHomeComponent
  }
]

export const ProjectRouting: ModuleWithProviders = RouterModule.forRoot(routes)